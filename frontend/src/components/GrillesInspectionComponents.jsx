import React, { useState, useEffect, useCallback } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { useToast } from '../hooks/use-toast';
import { useConfirmDialog } from './ui/ConfirmDialog';
import { useTenant } from '../contexts/TenantContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import ReferentielSearch from './ReferentielSearch';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ====== COMPOSANTS DRAG & DROP ======

// Composant draggable pour les sections
const SortableSection = ({ section, sectionIndex, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id || `section-${sectionIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{
        backgroundColor: '#f8fafc',
        borderRadius: '12px',
        padding: '1rem',
        marginBottom: '1rem',
        border: isDragging ? '2px dashed #3b82f6' : '1px solid #e5e7eb'
      }}>
        {typeof children === 'function' 
          ? children({ dragHandleProps: { ...attributes, ...listeners } })
          : children
        }
      </div>
    </div>
  );
};

// Composant draggable pour les items/questions
const SortableItem = ({ item, itemIndex, sectionIndex, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id || `item-${sectionIndex}-${itemIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '0.75rem',
        marginBottom: '0.5rem',
        border: isDragging ? '2px dashed #3b82f6' : '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem'
      }}>
        {/* Handle de drag */}
        <button
          {...attributes}
          {...listeners}
          type="button"
          style={{
            cursor: 'grab',
            padding: '0.25rem',
            background: 'none',
            border: 'none',
            fontSize: '1rem',
            color: '#9ca3af',
            touchAction: 'none',
            flexShrink: 0
          }}
          title="Glisser pour réorganiser"
        >
          ⋮⋮
        </button>
        <div style={{ flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ====== EDITEUR DE GRILLE AVEC DRAG & DROP ======

const EditerGrille = ({ grille, onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [saving, setSaving] = useState(false);
  
  // État du formulaire
  const [formData, setFormData] = useState({
    nom: grille.nom || '',
    groupe_occupation: grille.groupe_occupation || '',
    description: grille.description || '',
    sections: (grille.sections || []).map((s, i) => ({
      ...s,
      id: s.id || `section-${Date.now()}-${i}`,
      items: (s.items || s.questions || []).map((item, j) => {
        // Convertir l'ancien format (string) vers le nouveau format (objet)
        if (typeof item === 'string') {
          return {
            id: `item-${Date.now()}-${i}-${j}`,
            label: item,
            type: 'radio',
            options: ['Conforme', 'Non conforme', 'N/A'],
            obligatoire: false
          };
        }
        return { ...item, id: item.id || `item-${Date.now()}-${i}-${j}` };
      })
    })),
    actif: grille.actif !== false,
    version: grille.version || '1.0'
  });

  // Configuration des capteurs pour drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Types de champs disponibles
  const typesChamp = [
    // === BASIQUE ===
    { value: 'radio', label: '🔘 Boutons radio (choix unique)', category: 'basic' },
    { value: 'checkbox', label: '☑️ Cases à cocher (choix multiples)', category: 'basic' },
    { value: 'texte', label: '📝 Texte libre', category: 'basic' },
    { value: 'nombre', label: '🔢 Nombre', category: 'basic' },
    { value: 'nombre_unite', label: '🔢 Nombre avec unité', category: 'basic' },
    { value: 'date', label: '📅 Date', category: 'basic' },
    { value: 'liste', label: '📋 Liste déroulante', category: 'basic' },
    
    // === MÉDIA ===
    { value: 'photo', label: '📷 Photo/Image', category: 'media' },
    { value: 'signature', label: '✍️ Signature', category: 'media' },
    { value: 'note_audio', label: '🎤 Note vocale', category: 'media' },
    
    // === PRÉVENTION ===
    { value: 'oui_non', label: '✓✗ Oui/Non', category: 'prevention' },
    { value: 'conforme_non_conforme', label: '✅ Conforme/Non conforme/N/A', category: 'prevention' },
    { value: 'etat', label: '🔴🟡🟢 État (Bon/Moyen/Mauvais)', category: 'prevention' },
    
    // === AVANCÉ ===
    { value: 'curseur', label: '📊 Curseur (slider)', category: 'advanced' },
    { value: 'chronometre', label: '⏱️ Chronomètre', category: 'advanced' },
    { value: 'compte_rebours', label: '⏲️ Compte à rebours', category: 'advanced' },
    { value: 'qr_code', label: '📱 Scan QR/Code-barres', category: 'advanced' },
    { value: 'calcul_auto', label: '🧮 Calcul automatique', category: 'advanced' },
    
    // === AUTO-REMPLI ===
    { value: 'inspecteur_auto', label: '👤 Inspecteur (auto-rempli)', category: 'auto' },
    { value: 'lieu_auto', label: '📍 Lieu (GPS ou adresse)', category: 'auto' },
    { value: 'meteo_auto', label: '🌤️ Météo (auto-rempli)', category: 'auto' },
  ];

  // ====== DRAG & DROP HANDLERS ======
  
  const handleSectionDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFormData(prev => {
        const oldIndex = prev.sections.findIndex(s => s.id === active.id);
        const newIndex = prev.sections.findIndex(s => s.id === over.id);
        return { ...prev, sections: arrayMove(prev.sections, oldIndex, newIndex) };
      });
    }
  };

  const handleItemDragEnd = (sectionIndex) => (event) => {
    const { active, over } = event;
    if (active.id !== over?.id) {
      setFormData(prev => {
        const sections = [...prev.sections];
        const items = sections[sectionIndex].items || [];
        const oldIndex = items.findIndex(item => item.id === active.id);
        const newIndex = items.findIndex(item => item.id === over.id);
        sections[sectionIndex] = {
          ...sections[sectionIndex],
          items: arrayMove(items, oldIndex, newIndex)
        };
        return { ...prev, sections };
      });
    }
  };

  // ====== GESTION DES SECTIONS ======

  const addSection = () => {
    const newSection = {
      id: `section-${Date.now()}`,
      titre: 'Nouvelle section',
      description: '',
      photos: [],
      items: []
    };
    setFormData(prev => ({ ...prev, sections: [...prev.sections, newSection] }));
  };

  const removeSection = async (index) => {
    const confirmed = await confirm({
      title: 'Supprimer la section',
      message: 'Supprimer cette section et tous ses éléments ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (confirmed) {
      setFormData(prev => ({
        ...prev,
        sections: prev.sections.filter((_, i) => i !== index)
      }));
    }
  };

  const duplicateSection = (index) => {
    const sectionToCopy = formData.sections[index];
    const newSection = {
      ...JSON.parse(JSON.stringify(sectionToCopy)),
      id: `section-${Date.now()}`,
      titre: `${sectionToCopy.titre} (copie)`,
      items: sectionToCopy.items.map((item, i) => ({
        ...item,
        id: `item-${Date.now()}-${i}`
      }))
    };
    setFormData(prev => ({
      ...prev,
      sections: [...prev.sections.slice(0, index + 1), newSection, ...prev.sections.slice(index + 1)]
    }));
  };

  const updateSection = (index, field, value) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[index] = { ...sections[index], [field]: value };
      return { ...prev, sections };
    });
  };

  // Upload photo pour une section
  const handleSectionPhotoUpload = async (sectionIndex, files) => {
    const newPhotos = [];
    for (const file of files) {
      const reader = new FileReader();
      await new Promise((resolve) => {
        reader.onloadend = () => {
          newPhotos.push({
            id: `photo-${Date.now()}-${Math.random()}`,
            data: reader.result,
            name: file.name
          });
          resolve();
        };
        reader.readAsDataURL(file);
      });
    }
    
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        photos: [...(sections[sectionIndex].photos || []), ...newPhotos]
      };
      return { ...prev, sections };
    });
  };

  const removeSectionPhoto = (sectionIndex, photoId) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        photos: (sections[sectionIndex].photos || []).filter(p => p.id !== photoId)
      };
      return { ...prev, sections };
    });
  };

  // ====== GESTION DES ITEMS/QUESTIONS ======

  const addItem = (sectionIndex, type = 'conforme_non_conforme') => {
    const defaultOptions = {
      'radio': ['Option 1', 'Option 2', 'Option 3'],
      'checkbox': ['Option 1', 'Option 2', 'Option 3'],
      'liste': ['Option 1', 'Option 2', 'Option 3'],
      'oui_non': ['Oui', 'Non'],
      'conforme_non_conforme': ['Conforme', 'Non conforme', 'N/A'],
      'etat': ['Bon', 'Moyen', 'Mauvais']
    };

    const newItem = {
      id: `item-${Date.now()}`,
      label: '',
      type: type,
      options: defaultOptions[type] || [],
      obligatoire: false,
      description: ''
    };

    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        items: [...(sections[sectionIndex].items || []), newItem]
      };
      return { ...prev, sections };
    });
  };

  const removeItem = (sectionIndex, itemIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      sections[sectionIndex] = {
        ...sections[sectionIndex],
        items: sections[sectionIndex].items.filter((_, i) => i !== itemIndex)
      };
      return { ...prev, sections };
    });
  };

  const updateItem = (sectionIndex, itemIndex, field, value) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = { ...items[itemIndex], [field]: value };
      
      // Si on change le type, mettre à jour les options par défaut
      if (field === 'type') {
        const defaultOptions = {
          'radio': ['Option 1', 'Option 2', 'Option 3'],
          'checkbox': ['Option 1', 'Option 2', 'Option 3'],
          'liste': ['Option 1', 'Option 2', 'Option 3'],
          'oui_non': ['Oui', 'Non'],
          'conforme_non_conforme': ['Conforme', 'Non conforme', 'N/A'],
          'etat': ['Bon', 'Moyen', 'Mauvais']
        };
        items[itemIndex].options = defaultOptions[value] || [];
      }
      
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  const updateItemOption = (sectionIndex, itemIndex, optionIndex, value) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      const options = [...(items[itemIndex].options || [])];
      options[optionIndex] = value;
      items[itemIndex] = { ...items[itemIndex], options };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  const addItemOption = (sectionIndex, itemIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = {
        ...items[itemIndex],
        options: [...(items[itemIndex].options || []), 'Nouvelle option']
      };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  const removeItemOption = (sectionIndex, itemIndex, optionIndex) => {
    setFormData(prev => {
      const sections = [...prev.sections];
      const items = [...sections[sectionIndex].items];
      items[itemIndex] = {
        ...items[itemIndex],
        options: items[itemIndex].options.filter((_, i) => i !== optionIndex)
      };
      sections[sectionIndex] = { ...sections[sectionIndex], items };
      return { ...prev, sections };
    });
  };

  // ====== SAUVEGARDE ======

  const handleSave = async () => {
    if (!formData.nom) {
      toast({ title: "Validation", description: "Le nom de la grille est requis", variant: "destructive" });
      return;
    }
    if (formData.sections.length === 0) {
      toast({ title: "Validation", description: "La grille doit contenir au moins une section", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      
      // Convertir les sections au format attendu par le backend
      const dataToSave = {
        ...formData,
        sections: formData.sections.map(section => ({
          ...section,
          // Garder le nouveau format avec items
          items: section.items,
          // Aussi générer les questions en string pour compatibilité
          questions: section.items.map(item => item.label)
        }))
      };

      await apiPut(tenantSlug, `/prevention/grilles-inspection/${grille.id}`, dataToSave);
      toast({ title: "Succès", description: "Grille mise à jour avec succès" });
      onSave();
    } catch (error) {
      console.error('Erreur sauvegarde:', error);
      toast({ title: "Erreur", description: "Impossible de sauvegarder la grille", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ====== RENDU D'UN ITEM ======

  const renderItemEditor = (item, sectionIndex, itemIndex) => {
    const needsOptions = ['radio', 'checkbox', 'liste'].includes(item.type);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1 }}>
        {/* Ligne principale: Label + Type + Obligatoire + Supprimer */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            value={item.label}
            onChange={(e) => updateItem(sectionIndex, itemIndex, 'label', e.target.value)}
            placeholder="Libellé de la question..."
            style={{ flex: 2, minWidth: '200px' }}
          />
          <select
            value={item.type}
            onChange={(e) => updateItem(sectionIndex, itemIndex, 'type', e.target.value)}
            style={{
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              minWidth: '180px'
            }}
          >
            <optgroup label="Prévention">
              {typesChamp.filter(t => t.category === 'prevention').map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Basique">
              {typesChamp.filter(t => t.category === 'basic').map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Média">
              {typesChamp.filter(t => t.category === 'media').map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Avancé">
              {typesChamp.filter(t => t.category === 'advanced').map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
            <optgroup label="Auto-rempli">
              {typesChamp.filter(t => t.category === 'auto').map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </optgroup>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={item.obligatoire}
              onChange={(e) => updateItem(sectionIndex, itemIndex, 'obligatoire', e.target.checked)}
            />
            Obligatoire
          </label>
          <Button
            size="sm"
            variant="outline"
            onClick={() => removeItem(sectionIndex, itemIndex)}
            style={{ color: '#ef4444' }}
          >
            🗑️
          </Button>
        </div>

        {/* Options pour radio/checkbox/liste */}
        {needsOptions && (
          <div style={{ 
            marginLeft: '1rem', 
            padding: '0.5rem', 
            backgroundColor: '#f9fafb', 
            borderRadius: '6px',
            border: '1px dashed #d1d5db'
          }}>
            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.5rem' }}>
              Options de réponse:
            </div>
            {(item.options || []).map((option, optionIndex) => (
              <div key={optionIndex} style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.25rem', alignItems: 'center' }}>
                <span style={{ color: '#9ca3af', width: '20px' }}>
                  {item.type === 'radio' ? '○' : item.type === 'checkbox' ? '☐' : '•'}
                </span>
                <Input
                  value={option}
                  onChange={(e) => updateItemOption(sectionIndex, itemIndex, optionIndex, e.target.value)}
                  style={{ flex: 1, height: '32px' }}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => removeItemOption(sectionIndex, itemIndex, optionIndex)}
                  style={{ padding: '0.25rem', height: '28px' }}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() => addItemOption(sectionIndex, itemIndex)}
              style={{ marginTop: '0.25rem' }}
            >
              + Ajouter option
            </Button>
          </div>
        )}

        {/* Configuration spécifique pour nombre_unite */}
        {item.type === 'nombre_unite' && (
          <div style={{ marginLeft: '1rem', padding: '0.5rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
            <Label style={{ fontSize: '0.75rem' }}>Unité par défaut (optionnel)</Label>
            <Input
              value={item.config?.unite_defaut || ''}
              onChange={(e) => updateItem(sectionIndex, itemIndex, 'config', { ...item.config, unite_defaut: e.target.value })}
              placeholder="Ex: mètres, kg, litres"
              style={{ marginTop: '0.25rem' }}
            />
          </div>
        )}

        {/* Configuration spécifique pour curseur */}
        {item.type === 'curseur' && (
          <div style={{ marginLeft: '1rem', padding: '0.5rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
              <div>
                <Label style={{ fontSize: '0.75rem' }}>Min</Label>
                <Input
                  type="number"
                  value={item.config?.min || 0}
                  onChange={(e) => updateItem(sectionIndex, itemIndex, 'config', { ...item.config, min: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label style={{ fontSize: '0.75rem' }}>Max</Label>
                <Input
                  type="number"
                  value={item.config?.max || 100}
                  onChange={(e) => updateItem(sectionIndex, itemIndex, 'config', { ...item.config, max: parseInt(e.target.value) })}
                />
              </div>
              <div>
                <Label style={{ fontSize: '0.75rem' }}>Pas</Label>
                <Input
                  type="number"
                  value={item.config?.step || 1}
                  onChange={(e) => updateItem(sectionIndex, itemIndex, 'config', { ...item.config, step: parseInt(e.target.value) })}
                />
              </div>
            </div>
          </div>
        )}

        {/* Configuration spécifique pour compte_rebours */}
        {item.type === 'compte_rebours' && (
          <div style={{ marginLeft: '1rem', padding: '0.5rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
            <Label style={{ fontSize: '0.75rem' }}>Durée initiale (secondes)</Label>
            <Input
              type="number"
              value={item.config?.duree_secondes || 60}
              onChange={(e) => updateItem(sectionIndex, itemIndex, 'config', { ...item.config, duree_secondes: parseInt(e.target.value) })}
              placeholder="Ex: 60 pour 1 minute"
              style={{ marginTop: '0.25rem' }}
            />
          </div>
        )}

        {/* Configuration spécifique pour calcul_auto */}
        {item.type === 'calcul_auto' && (
          <div style={{ marginLeft: '1rem', padding: '0.5rem', backgroundColor: '#f0f9ff', borderRadius: '6px', border: '1px solid #bae6fd' }}>
            <Label style={{ fontSize: '0.75rem' }}>Formule de calcul</Label>
            <Input
              value={item.config?.formule || ''}
              onChange={(e) => updateItem(sectionIndex, itemIndex, 'config', { ...item.config, formule: e.target.value })}
              placeholder="Ex: {champ1} + {champ2}"
              style={{ marginTop: '0.25rem' }}
            />
            <div style={{ fontSize: '0.65rem', color: '#6b7280', marginTop: '0.25rem' }}>
              💡 Utilisez les noms de champs entre accolades. Ex: {'{'}nombre_extincteurs{'}'} * 2
            </div>
          </div>
        )}

        {/* Configuration des alertes et anomalies */}
        {(['conforme_non_conforme', 'oui_non', 'etat', 'radio', 'checkbox'].includes(item.type)) && (
          <div style={{ 
            marginLeft: '1rem', 
            padding: '0.75rem', 
            backgroundColor: '#fef3c7', 
            borderRadius: '6px',
            border: '1px solid #f59e0b',
            marginTop: '0.5rem'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <input
                type="checkbox"
                id={`alerte-${sectionIndex}-${itemIndex}`}
                checked={!!item.alerte?.actif}
                onChange={(e) => {
                  const newAlerte = e.target.checked 
                    ? { actif: true, declencheur: '', creer_anomalie: true, article_ref: null }
                    : null;
                  updateItem(sectionIndex, itemIndex, 'alerte', newAlerte);
                }}
              />
              <Label htmlFor={`alerte-${sectionIndex}-${itemIndex}`} style={{ margin: 0, cursor: 'pointer', fontWeight: '600' }}>
                ⚠️ Déclencher une alerte si...
              </Label>
            </div>

            {item.alerte?.actif && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div>
                  <Label style={{ fontSize: '0.75rem' }}>Condition de déclenchement</Label>
                  <select
                    value={item.alerte?.declencheur || ''}
                    onChange={(e) => updateItem(sectionIndex, itemIndex, 'alerte', { ...item.alerte, declencheur: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                      marginTop: '0.25rem'
                    }}
                  >
                    <option value="">-- Sélectionner --</option>
                    {item.type === 'conforme_non_conforme' && (
                      <>
                        <option value="non_conforme">Non conforme</option>
                        <option value="conforme">Conforme</option>
                      </>
                    )}
                    {item.type === 'oui_non' && (
                      <>
                        <option value="non">Non</option>
                        <option value="oui">Oui</option>
                      </>
                    )}
                    {item.type === 'etat' && (
                      <>
                        <option value="mauvais">Mauvais</option>
                        <option value="moyen">Moyen</option>
                        <option value="bon">Bon</option>
                      </>
                    )}
                    {(item.type === 'radio' || item.type === 'checkbox') && (item.options || []).map((opt, idx) => (
                      <option key={idx} value={opt.toLowerCase().replace(/\s+/g, '_')}>{opt}</option>
                    ))}
                  </select>
                </div>

                {item.alerte?.declencheur && (
                  <div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      <input
                        type="checkbox"
                        checked={item.alerte?.creer_anomalie !== false}
                        onChange={(e) => updateItem(sectionIndex, itemIndex, 'alerte', { ...item.alerte, creer_anomalie: e.target.checked })}
                      />
                      Créer automatiquement une anomalie (non-conformité)
                    </label>

                    {item.alerte?.creer_anomalie !== false && (
                      <ReferentielSearch
                        value={item.alerte?.article_ref}
                        onChange={(ref) => updateItem(sectionIndex, itemIndex, 'alerte', { ...item.alerte, article_ref: ref })}
                        questionType={item.type}
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Description/aide pour la question */}
        <Input
          value={item.description || ''}
          onChange={(e) => updateItem(sectionIndex, itemIndex, 'description', e.target.value)}
          placeholder="Description ou aide (optionnel)"
          style={{ fontSize: '0.875rem', color: '#6b7280' }}
        />
      </div>
    );
  };

  // ====== RENDU PRINCIPAL ======

  return (
    <div style={{ padding: '1rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: '#f8fafc',
        borderRadius: '12px'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>
          ✏️ Modifier la Grille: {grille.nom}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="outline" onClick={onClose}>✕ Annuler</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '⏳ Sauvegarde...' : '💾 Enregistrer'}
          </Button>
        </div>
      </div>

      {/* Informations Générales */}
      <div style={{ 
        backgroundColor: '#f8fafc', 
        borderRadius: '12px', 
        padding: '1.5rem', 
        marginBottom: '1.5rem',
        border: '1px solid #e5e7eb'
      }}>
        <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>
          Informations Générales
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <Label>Nom de la grille *</Label>
            <Input
              value={formData.nom}
              onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
              placeholder="Ex: Grille Résidentielle"
            />
          </div>
          <div>
            <Label>Groupe d'occupation</Label>
            <select
              value={formData.groupe_occupation}
              onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
              style={{
                width: '100%',
                padding: '0.5rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem'
              }}
            >
              <option value="">-- Sélectionner --</option>
              <option value="A">A - Établissements de Réunion</option>
              <option value="B">B - Soins, Traitement ou Détention</option>
              <option value="C">C - Habitations</option>
              <option value="D">D - Affaires et Services</option>
              <option value="E">E - Établissements Commerciaux</option>
              <option value="F">F - Établissements Industriels</option>
              <option value="I">I - Établissements d'Assemblée</option>
            </select>
          </div>
          <div>
            <Label>Version</Label>
            <Input
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              placeholder="1.0"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
            <input
              type="checkbox"
              id="grille-active"
              checked={formData.actif}
              onChange={(e) => setFormData({ ...formData, actif: e.target.checked })}
            />
            <Label htmlFor="grille-active" style={{ margin: 0, cursor: 'pointer' }}>
              Grille active
            </Label>
          </div>
        </div>
        <div style={{ marginTop: '1rem' }}>
          <Label>Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Description de la grille d'inspection..."
            rows={2}
          />
        </div>
      </div>

      {/* Sections avec Drag & Drop */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1rem' 
        }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
            📋 Sections ({formData.sections.length})
          </h3>
          <Button onClick={addSection}>
            ➕ Ajouter une section
          </Button>
        </div>

        {formData.sections.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            padding: '3rem', 
            backgroundColor: '#f9fafb', 
            borderRadius: '12px',
            border: '2px dashed #d1d5db'
          }}>
            <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
              Aucune section. Cliquez sur "Ajouter une section" pour commencer.
            </p>
            <Button onClick={addSection}>➕ Ajouter une section</Button>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleSectionDragEnd}
          >
            <SortableContext
              items={formData.sections.map(s => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {formData.sections.map((section, sectionIndex) => (
                <SortableSection key={section.id} section={section} sectionIndex={sectionIndex}>
                  {({ dragHandleProps }) => (
                    <>
                      {/* Header de section */}
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '1rem',
                        paddingBottom: '0.75rem',
                        borderBottom: '1px solid #e5e7eb'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <button
                            {...dragHandleProps}
                            type="button"
                            style={{
                              cursor: 'grab',
                              padding: '0.5rem',
                              background: '#e5e7eb',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '1rem',
                              touchAction: 'none'
                            }}
                            title="Glisser pour réorganiser"
                          >
                            ⋮⋮
                          </button>
                          <span style={{ 
                            backgroundColor: '#3b82f6', 
                            color: 'white', 
                            padding: '0.25rem 0.75rem', 
                            borderRadius: '9999px',
                            fontSize: '0.875rem',
                            fontWeight: '600'
                          }}>
                            Section {sectionIndex + 1}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <Button size="sm" variant="outline" onClick={() => duplicateSection(sectionIndex)}>
                            📋 Dupliquer
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => removeSection(sectionIndex)} style={{ color: '#ef4444' }}>
                            🗑️ Supprimer
                          </Button>
                        </div>
                      </div>

                      {/* Contenu de section */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <Label>Titre de la section *</Label>
                          <Input
                            value={section.titre}
                            onChange={(e) => updateSection(sectionIndex, 'titre', e.target.value)}
                            placeholder="Ex: Moyens d'évacuation"
                          />
                        </div>
                        <div>
                          <Label>Description (optionnel)</Label>
                          <Input
                            value={section.description || ''}
                            onChange={(e) => updateSection(sectionIndex, 'description', e.target.value)}
                            placeholder="Instructions pour cette section..."
                          />
                        </div>
                      </div>

                      {/* Photos de référence */}
                      <div style={{ marginBottom: '1rem' }}>
                        <Label>Photos de référence</Label>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                          {(section.photos || []).map((photo) => (
                            <div key={photo.id} style={{ position: 'relative' }}>
                              <img
                                src={photo.data}
                                alt={photo.name}
                                style={{ 
                                  width: '80px', 
                                  height: '80px', 
                                  objectFit: 'cover', 
                                  borderRadius: '8px',
                                  border: '1px solid #d1d5db'
                                }}
                              />
                              <button
                                onClick={() => removeSectionPhoto(sectionIndex, photo.id)}
                                style={{
                                  position: 'absolute',
                                  top: '-8px',
                                  right: '-8px',
                                  background: '#ef4444',
                                  color: 'white',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '20px',
                                  height: '20px',
                                  cursor: 'pointer',
                                  fontSize: '12px'
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <label style={{
                            width: '80px',
                            height: '80px',
                            border: '2px dashed #d1d5db',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            backgroundColor: '#f9fafb'
                          }}>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => handleSectionPhotoUpload(sectionIndex, Array.from(e.target.files))}
                              style={{ display: 'none' }}
                            />
                            <span style={{ fontSize: '1.5rem', color: '#9ca3af' }}>+</span>
                          </label>
                        </div>
                      </div>

                      {/* Items/Questions avec Drag & Drop */}
                      <div>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          marginBottom: '0.5rem'
                        }}>
                          <Label style={{ margin: 0 }}>
                            Éléments à vérifier ({(section.items || []).length})
                          </Label>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  addItem(sectionIndex, e.target.value);
                                  e.target.value = ''; // Reset après ajout
                                }
                              }}
                              style={{
                                padding: '0.375rem 0.75rem',
                                borderRadius: '6px',
                                border: '1px solid #d1d5db',
                                fontSize: '0.875rem',
                                backgroundColor: 'white',
                                cursor: 'pointer'
                              }}
                            >
                              <option value="">➕ Ajouter un élément...</option>
                              <optgroup label="Prévention">
                                <option value="conforme_non_conforme">✅ Conforme/Non conforme/N/A</option>
                                <option value="oui_non">✓✗ Oui/Non</option>
                                <option value="etat">🔴🟡🟢 État (Bon/Moyen/Mauvais)</option>
                              </optgroup>
                              <optgroup label="Basique">
                                <option value="radio">🔘 Boutons radio</option>
                                <option value="checkbox">☑️ Cases à cocher</option>
                                <option value="texte">📝 Texte libre</option>
                                <option value="nombre">🔢 Nombre</option>
                                <option value="nombre_unite">🔢 Nombre avec unité</option>
                                <option value="date">📅 Date</option>
                                <option value="liste">📋 Liste déroulante</option>
                              </optgroup>
                              <optgroup label="Média">
                                <option value="photo">📷 Photo</option>
                                <option value="signature">✍️ Signature</option>
                                <option value="note_audio">🎤 Note vocale</option>
                              </optgroup>
                              <optgroup label="Avancé">
                                <option value="curseur">📊 Curseur (slider)</option>
                                <option value="chronometre">⏱️ Chronomètre</option>
                                <option value="compte_rebours">⏲️ Compte à rebours</option>
                                <option value="qr_code">📱 QR/Code-barres</option>
                                <option value="calcul_auto">🧮 Calcul automatique</option>
                              </optgroup>
                              <optgroup label="Auto-rempli">
                                <option value="inspecteur_auto">👤 Inspecteur</option>
                                <option value="lieu_auto">📍 Lieu (GPS/adresse)</option>
                                <option value="meteo_auto">🌤️ Météo</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>

                        {(section.items || []).length === 0 ? (
                          <div style={{ 
                            textAlign: 'center', 
                            padding: '1.5rem', 
                            backgroundColor: '#f9fafb',
                            borderRadius: '8px',
                            border: '1px dashed #d1d5db'
                          }}>
                            <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>
                              Aucun élément. Ajoutez des questions à vérifier.
                            </p>
                          </div>
                        ) : (
                          <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleItemDragEnd(sectionIndex)}
                          >
                            <SortableContext
                              items={(section.items || []).map(item => item.id)}
                              strategy={verticalListSortingStrategy}
                            >
                              {(section.items || []).map((item, itemIndex) => (
                                <SortableItem
                                  key={item.id}
                                  item={item}
                                  itemIndex={itemIndex}
                                  sectionIndex={sectionIndex}
                                >
                                  {renderItemEditor(item, sectionIndex, itemIndex)}
                                </SortableItem>
                              ))}
                            </SortableContext>
                          </DndContext>
                        )}
                      </div>
                    </>
                  )}
                </SortableSection>
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};

// ====== LISTE DES GRILLES ======

const GrillesInspection = () => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const { confirm } = useConfirmDialog();
  const [grilles, setGrilles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingGrille, setEditingGrille] = useState(null);
  const [creatingNew, setCreatingNew] = useState(false);

  const fetchGrilles = async () => {
    try {
      setLoading(true);
      const data = await apiGet(tenantSlug, '/prevention/grilles-inspection');
      setGrilles(data || []);
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
    const confirmed = await confirm({
      title: 'Supprimer la grille',
      message: 'Êtes-vous sûr de vouloir supprimer cette grille d\'inspection ?',
      variant: 'danger',
      confirmText: 'Supprimer'
    });
    if (!confirmed) return;
    
    try {
      await apiDelete(tenantSlug, `/prevention/grilles-inspection/${grilleId}`);
      toast({ title: "Succès", description: "Grille supprimée avec succès" });
      fetchGrilles();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la grille",
        variant: "destructive"
      });
    }
  };

  const handleCreateGrille = async () => {
    try {
      const newGrille = {
        nom: 'Nouvelle grille',
        groupe_occupation: '',
        description: '',
        sections: [],
        actif: true,
        version: '1.0'
      };
      
      const result = await apiPost(tenantSlug, '/prevention/grilles-inspection', newGrille);
      toast({ title: "Succès", description: "Grille créée avec succès" });
      
      // Ouvrir directement l'éditeur
      setEditingGrille(result);
      fetchGrilles();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de créer la grille",
        variant: "destructive"
      });
    }
  };

  const handleDuplicateGrille = async (grille) => {
    try {
      const newGrille = {
        ...grille,
        id: undefined,
        nom: `${grille.nom} (copie)`,
        tenant_id: undefined
      };
      
      await apiPost(tenantSlug, '/prevention/grilles-inspection', newGrille);
      toast({ title: "Succès", description: "Grille dupliquée avec succès" });
      fetchGrilles();
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Impossible de dupliquer la grille",
        variant: "destructive"
      });
    }
  };

  // Si on édite une grille, afficher l'éditeur
  if (editingGrille) {
    return (
      <EditerGrille
        grille={editingGrille}
        onClose={() => setEditingGrille(null)}
        onSave={() => {
          setEditingGrille(null);
          fetchGrilles();
        }}
      />
    );
  }

  // Liste des grilles
  return (
    <div style={{ padding: '1rem' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '1.5rem'
      }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: '600', margin: 0 }}>
            📋 Grilles d'Inspection
          </h2>
          <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            Gérez les grilles d'inspection pour la prévention incendie
          </p>
        </div>
        <Button onClick={handleCreateGrille}>
          ➕ Nouvelle grille
        </Button>
      </div>

      {/* Liste */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <p>Chargement...</p>
        </div>
      ) : grilles.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '3rem', 
          backgroundColor: '#f9fafb',
          borderRadius: '12px',
          border: '2px dashed #d1d5db'
        }}>
          <p style={{ color: '#6b7280', marginBottom: '1rem' }}>
            Aucune grille d'inspection disponible.
          </p>
          <Button onClick={handleCreateGrille}>➕ Créer une grille</Button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '1rem' }}>
          {grilles.map((grille) => (
            <div
              key={grille.id}
              style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '1rem',
                border: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <h3 style={{ fontSize: '1.125rem', fontWeight: '600', margin: 0 }}>
                    {grille.nom}
                  </h3>
                  {grille.groupe_occupation && (
                    <span style={{
                      backgroundColor: '#dbeafe',
                      color: '#1d4ed8',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '500'
                    }}>
                      Groupe {grille.groupe_occupation}
                    </span>
                  )}
                  {grille.actif === false && (
                    <span style={{
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      padding: '0.125rem 0.5rem',
                      borderRadius: '9999px',
                      fontSize: '0.75rem'
                    }}>
                      Inactive
                    </span>
                  )}
                </div>
                <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>
                  {grille.sections?.length || 0} section(s) • 
                  {grille.sections?.reduce((acc, s) => acc + (s.items?.length || s.questions?.length || 0), 0) || 0} élément(s)
                  {grille.version && ` • v${grille.version}`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <Button size="sm" variant="outline" onClick={() => handleDuplicateGrille(grille)}>
                  📋 Dupliquer
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingGrille(grille)}>
                  ✏️ Modifier
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleDeleteGrille(grille.id)}
                  style={{ color: '#ef4444' }}
                >
                  🗑️
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ====== CRÉER GRILLE (simplifié) ======

const CreateGrilleInspection = ({ onClose, onSave }) => {
  const { tenantSlug } = useTenant();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    nom: '',
    groupe_occupation: '',
    description: '',
    sections: [],
    actif: true,
    version: '1.0'
  });

  const handleSave = async () => {
    if (!formData.nom) {
      toast({ title: "Validation", description: "Le nom est requis", variant: "destructive" });
      return;
    }

    try {
      setSaving(true);
      await apiPost(tenantSlug, '/prevention/grilles-inspection', formData);
      toast({ title: "Succès", description: "Grille créée avec succès" });
      onSave();
    } catch (error) {
      toast({ title: "Erreur", description: "Impossible de créer la grille", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2 style={{ marginBottom: '1.5rem' }}>➕ Nouvelle Grille d'Inspection</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <Label>Nom de la grille *</Label>
          <Input
            value={formData.nom}
            onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
            placeholder="Ex: Grille Industrielle"
          />
        </div>
        <div>
          <Label>Groupe d'occupation</Label>
          <select
            value={formData.groupe_occupation}
            onChange={(e) => setFormData({ ...formData, groupe_occupation: e.target.value })}
            style={{
              width: '100%',
              padding: '0.5rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db'
            }}
          >
            <option value="">-- Sélectionner --</option>
            <option value="A">A - Établissements de Réunion</option>
            <option value="B">B - Soins, Traitement ou Détention</option>
            <option value="C">C - Habitations</option>
            <option value="D">D - Affaires et Services</option>
            <option value="E">E - Établissements Commerciaux</option>
            <option value="F">F - Établissements Industriels</option>
            <option value="I">I - Établissements d'Assemblée</option>
          </select>
        </div>
        <div>
          <Label>Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Description de la grille..."
            rows={3}
          />
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
        <Button variant="outline" onClick={onClose}>Annuler</Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Création...' : 'Créer'}
        </Button>
      </div>
    </div>
  );
};

export { GrillesInspection, EditerGrille, CreateGrilleInspection };
export default GrillesInspection;
